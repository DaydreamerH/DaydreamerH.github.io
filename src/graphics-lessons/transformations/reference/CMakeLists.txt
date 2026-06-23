add_executable(05_transformations transform.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(05_transformations glfw opengl32)
endif()

foreach(FILE_NAME transform.vs transform.fs)
    add_custom_command(TARGET 05_transformations POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:05_transformations>/${FILE_NAME}"
    )
endforeach()

foreach(IMG_FILE wall.jpg awesomeface.png)
    add_custom_command(TARGET 05_transformations POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/images/${IMG_FILE}"
        "$<TARGET_FILE_DIR:05_transformations>/${IMG_FILE}"
    )
endforeach()